from django.urls import path
from .views import state, progress, answer
from .feedback import feedback_submit, feedback_inbox, feedback_update
from . import access_views
urlpatterns = [path('state/', state), path('units/<str:unit_id>/', progress), path('units/<str:unit_id>/answer/', answer)]
urlpatterns += [path('units/<str:unit_id>/feedback/', feedback_submit), path('feedback/inbox/', feedback_inbox), path('feedback/<int:feedback_id>/', feedback_update)]
urlpatterns += [path('catalog/', access_views.catalog), path('content/<str:unit_id>/', access_views.unit_content), path('media/<str:unit_id>/<str:filename>/', access_views.media), path('plans/', access_views.plans), path('orders/', access_views.order_request)]
urlpatterns += [path('price-quote/', access_views.price_quote)]
