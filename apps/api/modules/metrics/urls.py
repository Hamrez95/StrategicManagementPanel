from django.urls import path

from .views import contribution_collection, contribution_detail, observation_collection

urlpatterns = [
    path("observations/", observation_collection),
    path("contribution-runs/", contribution_collection),
    path("contribution-runs/<uuid:run_id>/", contribution_detail),
]
