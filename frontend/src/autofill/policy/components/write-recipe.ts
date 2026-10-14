import { componentCapability, componentPolicy } from "../component-policy";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
export function componentWriteRecipe(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
) {
  const input = handle.elements[0];
  if (
    !(input instanceof HTMLInputElement) ||
    !componentCapability(input.ownerDocument, "commit")
  )
    return undefined;
  const matches = componentPolicy(input.ownerDocument).writeRecipes.filter(
    (r) => r.name === handle.candidate.domName,
  );
  if (matches.length !== 1) return undefined;
  return matches[0];
}
export function recipeBindingMatches(
  handle: FieldCandidateHandle,
  item: ReviewPlanItem,
  recipe: NonNullable<ReturnType<typeof componentWriteRecipe>>,
) {
  const input = handle.elements[0];
  const binding = item.analysis?.valueBinding;
  return (
    input instanceof HTMLInputElement &&
    handle.elements.length === 1 &&
    recipe.inputTypes.includes(input.type) &&
    item.analysis?.writePlan?.command === recipe.command &&
    binding?.type === "DIRECT" &&
    binding.profileFieldKey === recipe.key
  );
}
