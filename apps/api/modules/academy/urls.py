from django.urls import path
from .views import state, progress, answer
from .feedback import feedback_submit, feedback_inbox, feedback_update
urlpatterns = [path('state/', state), path('units/<str:unit_id>/', progress), path('units/<str:unit_id>/answer/', answer)]
urlpatterns += [path('units/<str:unit_id>/feedback/', feedback_submit), path('feedback/inbox/', feedback_inbox), path('feedback/<int:feedback_id>/', feedback_update)]
