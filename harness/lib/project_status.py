class UnsupportedStatusLabel(ValueError):
    pass


STATUS_LABEL_TO_PROJECT_STATUS = {
    "status:planning": "In Progress",
    "status:ready": "In Progress",
    "status:in-progress": "In Progress",
    "status:blocked": "In Progress",
    "status:review": "On Review",
}


def project_status_for_label(label: str) -> str:
    try:
        return STATUS_LABEL_TO_PROJECT_STATUS[label]
    except KeyError as error:
        raise UnsupportedStatusLabel(f"지원하지 않는 상태 라벨입니다: {label}") from error
