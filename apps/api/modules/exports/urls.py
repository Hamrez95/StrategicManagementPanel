from django.urls import path

from .views import export_collection, export_detail, export_download

urlpatterns = [
    path('', export_collection),
    path('<uuid:record_id>/', export_detail),
    path('<uuid:record_id>/download/', export_download),
]
