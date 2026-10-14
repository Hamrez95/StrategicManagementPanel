from django.urls import path
from modules.core.views import live, ready

urlpatterns = [path('api/v1/health/live', live), path('api/v1/health/ready', ready)]
