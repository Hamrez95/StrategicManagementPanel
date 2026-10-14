from django.urls import path

from .views import action_detail, decision_collection, decision_detail, execution_board, goal_collection, goal_detail

urlpatterns = [
    path('', execution_board),
    path('actions/<uuid:record_id>/', action_detail),
    path('decisions/', decision_collection),
    path('decisions/<uuid:record_id>/', decision_detail),
    path('goals/', goal_collection),
    path('goals/<uuid:record_id>/', goal_detail),
]
