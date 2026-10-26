from django.urls import path

from .views import contribution_collection, contribution_detail, observation_collection
from .workbench_views import captures, calculate_capture

urlpatterns = [
    path('captures/', captures),
    path('captures/<uuid:capture_id>/calculate/', calculate_capture),
    path("observations/", observation_collection),
    path("contribution-runs/", contribution_collection),
    path("contribution-runs/<uuid:run_id>/", contribution_detail),
]
