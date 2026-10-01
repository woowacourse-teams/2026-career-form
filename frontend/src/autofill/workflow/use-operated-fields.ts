import { useMemo, useState } from "react";

export function useOperatedFields(pageDocument: Document) {
  const operated = useMemo(
    () => new Map<string, Set<HTMLElement>>(),
    [pageDocument],
  );
  const [operatedCategories, setOperatedCategories] = useState<string[]>([]);
  const recordOperation = (element: Element | undefined, category: string) => {
    if (
      !element ||
      element.ownerDocument !== pageDocument ||
      !element.isConnected
    )
      return;
    const label = category.replaceAll("·", "/");
    const anchors = operated.get(label) ?? new Set<HTMLElement>();
    anchors.add(element as HTMLElement);
    operated.set(label, anchors);
    setOperatedCategories([...operated.keys()]);
  };
  return { operated, operatedCategories, recordOperation };
}
