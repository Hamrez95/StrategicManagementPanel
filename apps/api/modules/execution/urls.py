from django.urls import path

from .views import action_detail, decision_collection, decision_detail, execution_board, goal_collection, goal_detail
from . import scorecard_views as bsc

urlpatterns = [
    path('scorecards/', bsc.collection),
    path('scorecards/<uuid:card_id>/', bsc.detail),
    path('scorecards/<uuid:card_id>/observations/', bsc.append, {'kind': 'observation'}),
    path('scorecards/<uuid:card_id>/reviews/', bsc.append, {'kind': 'review'}),
    path('scorecards/<uuid:card_id>/objectives/<uuid:objective_id>/actions/', bsc.action),
    path('', execution_board),
    path('actions/<uuid:record_id>/', action_detail),
    path('decisions/', decision_collection),
    path('decisions/<uuid:record_id>/', decision_detail),
    path('goals/', goal_collection),
    path('goals/<uuid:record_id>/', goal_detail),
]
