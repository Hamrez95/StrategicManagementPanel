from rest_framework.views import exception_handler as drf_exception_handler

def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return response
    response.data = {'code': getattr(exc, 'default_code', 'request_error'), 'message': 'Request could not be completed.', 'fields': response.data if isinstance(response.data, dict) else {}}
    return response
