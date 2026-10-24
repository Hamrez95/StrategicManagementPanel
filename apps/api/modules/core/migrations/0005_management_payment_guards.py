"""Explicit guards for STR-029 additions; prior migrations keep frozen model sets."""
import hashlib

from django.db import migrations

CHOICES = [
    ('workspaces_managementdiscount', 'status', ['draft', 'active', 'disabled']),
    ('workspaces_managementorder', 'status', ['awaiting_payment', 'paid', 'cancelled', 'payment_review', 'refund_pending', 'refunded']),
    ('workspaces_managementpaymentattempt', 'status', ['created', 'pending', 'unknown', 'failed', 'succeeded']),
    ('workspaces_managementrefund', 'status', ['created', 'pending', 'unknown', 'failed', 'succeeded']),
]


def choice_name(table, field):
    return 'ci_choice_' + hashlib.sha256((table + field).encode()).hexdigest()[:16]


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    q = schema_editor.quote_name
    for table, field, values in CHOICES:
        allowed = ', '.join("'" + value + "'" for value in values)
        schema_editor.execute(f'ALTER TABLE {q(table)} ADD CONSTRAINT {q(choice_name(table, field))} CHECK ({q(field)} IN ({allowed}))')
    schema_editor.execute('''CREATE FUNCTION stratino_payment_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE mutable text[];
    BEGIN
      mutable := CASE TG_TABLE_NAME
        WHEN 'workspaces_managementorder' THEN ARRAY['status', 'subscription_id', 'cancel_request_id']
        WHEN 'workspaces_managementpaymentattempt' THEN ARRAY['status', 'transaction_reference']
        WHEN 'workspaces_managementrefund' THEN ARRAY['status', 'transaction_reference'] END;
      IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
        RAISE EXCEPTION 'Payment identity and snapshots are immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_TABLE_NAME = 'workspaces_managementorder' THEN
        IF OLD.subscription_id IS NOT NULL AND NEW.subscription_id IS DISTINCT FROM OLD.subscription_id THEN
          RAISE EXCEPTION 'Order grant link is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW.status <> OLD.status AND NOT (
          (OLD.status = 'awaiting_payment' AND NEW.status IN ('paid','cancelled','payment_review')) OR
          (OLD.status = 'cancelled' AND NEW.status = 'payment_review') OR
          (OLD.status IN ('paid','payment_review') AND NEW.status = 'refund_pending') OR
          (OLD.status = 'refund_pending' AND NEW.status = 'refunded')) THEN
          RAISE EXCEPTION 'Invalid order transition' USING ERRCODE = '23514';
        END IF;
        IF NEW.cancel_request_id IS DISTINCT FROM OLD.cancel_request_id AND NOT (
          OLD.status = 'awaiting_payment' AND NEW.status = 'cancelled'
          AND OLD.cancel_request_id IS NULL AND NEW.cancel_request_id IS NOT NULL) THEN
          RAISE EXCEPTION 'Cancellation idempotency key is immutable' USING ERRCODE = '23514';
        END IF;
        IF NEW.status = 'cancelled' AND NEW.cancel_request_id IS NULL THEN
          RAISE EXCEPTION 'Cancellation requires an idempotency key' USING ERRCODE = '23514';
        END IF;
      ELSIF TG_TABLE_NAME = 'workspaces_managementpaymentattempt' AND OLD.status IN ('succeeded','failed')
        AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Terminal payment attempt is immutable' USING ERRCODE = '23514';
      ELSIF TG_TABLE_NAME = 'workspaces_managementrefund' AND OLD.status IN ('succeeded','failed')
        AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Settled refund is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    for table in ['managementorder', 'managementpaymentattempt', 'managementrefund']:
        schema_editor.execute(f'CREATE TRIGGER ci_{table}_snapshot BEFORE UPDATE ON workspaces_{table} FOR EACH ROW EXECUTE FUNCTION stratino_payment_snapshot()')
    schema_editor.execute('''CREATE FUNCTION stratino_payment_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Payment audit events are append-only' USING ERRCODE = '23514'; END $$''')
    schema_editor.execute('CREATE TRIGGER ci_payment_event_immutable BEFORE UPDATE OR DELETE ON workspaces_managementpaymentevent FOR EACH ROW EXECUTE FUNCTION stratino_payment_event_immutable()')
    schema_editor.execute('''CREATE FUNCTION stratino_order_grant_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.subscription_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM workspaces_managementsubscription s WHERE s.id = NEW.subscription_id
          AND s.billing_account_id = NEW.billing_account_id AND s.plan_id = NEW.plan_id AND s.request_id = NEW.id
      ) THEN
        RAISE EXCEPTION 'Order subscription scope mismatch' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$''')
    schema_editor.execute('CREATE TRIGGER ci_order_grant_scope BEFORE INSERT OR UPDATE ON workspaces_managementorder FOR EACH ROW EXECUTE FUNCTION stratino_order_grant_scope()')


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    q = schema_editor.quote_name
    for table in ['managementorder', 'managementpaymentattempt', 'managementrefund']:
        schema_editor.execute(f'DROP TRIGGER ci_{table}_snapshot ON workspaces_{table}')
    schema_editor.execute('DROP TRIGGER ci_payment_event_immutable ON workspaces_managementpaymentevent')
    schema_editor.execute('DROP TRIGGER ci_order_grant_scope ON workspaces_managementorder')
    for function in ['stratino_payment_snapshot', 'stratino_payment_event_immutable', 'stratino_order_grant_scope']:
        schema_editor.execute(f'DROP FUNCTION {function}()')
    for table, field, _ in CHOICES:
        schema_editor.execute(f'ALTER TABLE {q(table)} DROP CONSTRAINT {q(choice_name(table, field))}')


class Migration(migrations.Migration):
    dependencies = [('core', '0004_billing_owner_identity'), ('workspaces', '0009_managementdiscount_managementorder_and_more')]
    operations = [migrations.RunPython(install, uninstall)]
