from django.urls import path
from .views import state, progress, answer
urlpatterns = [path('state/', state), path('units/<str:unit_id>/', progress), path('units/<str:unit_id>/answer/', answer)]
