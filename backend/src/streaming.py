import json


def step_event(node: str, detail: str) -> str:
    return f"data: {json.dumps({'type': 'step', 'node': node, 'detail': detail})}\n\n"


def token_event(text: str) -> str:
    return f"data: {json.dumps({'type': 'token', 'text': text})}\n\n"


def state_event(iteration: int, quality: int) -> str:
    return f"data: {json.dumps({'type': 'state', 'iteration': iteration, 'quality': quality})}\n\n"


def final_event(report: str, validation: dict, thread_id: str) -> str:
    return f"data: {json.dumps({'type': 'final', 'report': report, 'validation': validation, 'thread_id': thread_id})}\n\n"


def error_event(message: str) -> str:
    return f"data: {json.dumps({'type': 'error', 'message': message})}\n\n"
