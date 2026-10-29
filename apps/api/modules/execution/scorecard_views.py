from django.views.decorators.http import require_http_methods, require_POST
from .views import _run, _body, _error
from .scorecards import read_cards, save_card, append_record, add_action


@require_http_methods(['GET', 'POST'])
def collection(request, workspace_id):
    if request.method == 'GET':
        return _run(request, workspace_id, lambda w: read_cards(request.user, w))
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda w: save_card(request.user, w, body), status=201)


@require_http_methods(['PATCH'])
def detail(request, workspace_id, card_id):
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda w: save_card(request.user, w, body, card_id))


@require_POST
def append(request, workspace_id, card_id, kind):
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda w: append_record(request.user, w, card_id, body, kind), status=201)


@require_POST
def action(request, workspace_id, card_id, objective_id):
    body = _body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    return _run(request, workspace_id, lambda w: add_action(request.user, w, card_id, objective_id, body), status=201)
