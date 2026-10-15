from django.urls import path

from .views import document_collection, document_detail

urlpatterns = [
    path('', document_collection),
    path('<uuid:record_id>/', document_detail),
]
