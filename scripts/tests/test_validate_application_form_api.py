import unittest

from scripts.tests.application_form_api_validator_current_cases import (
    ApplicationFormApiCurrentCases,
)
from scripts.tests.application_form_api_validator_fixture import (
    ApplicationFormApiValidatorTestCase,
)
from scripts.tests.application_form_api_validator_legacy_cases import (
    ApplicationFormApiLegacyCases,
)


class ApplicationFormApiValidatorTest(
    ApplicationFormApiLegacyCases,
    ApplicationFormApiCurrentCases,
    ApplicationFormApiValidatorTestCase,
):
    pass


if __name__ == "__main__":
    unittest.main()
