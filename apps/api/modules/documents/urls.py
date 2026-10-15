from django.urls import path

from .views import (
    attachment_collection,
    attachment_content,
    attachment_detail,
    attachment_download,
    attachment_scan,
    document_collection,
    document_detail,
)

urlpatterns = [
    path('', document_collection),
    path('<uuid:record_id>/', document_detail),
    path('<uuid:record_id>/attachments/', attachment_collection),
    path('<uuid:record_id>/attachments/<uuid:attachment_id>/content/', attachment_content),
    path('<uuid:record_id>/attachments/<uuid:attachment_id>/scan/', attachment_scan),
    path('<uuid:record_id>/attachments/<uuid:attachment_id>/download/', attachment_download),
    path('<uuid:record_id>/attachments/<uuid:attachment_id>/', attachment_detail),
]
