import {
  createContext,
  useContext,
  useLayoutEffect,
  type Dispatch,
} from "react";

export interface PanelHeading {
  title?: string;
  /** Spoken name when the visible title is a shortened form of it. */
  titleLabel?: string;
  step?: string;
}

const PanelHeadingContext = createContext<Dispatch<PanelHeading> | null>(null);

/** The panel owns the title row; the screen rendered inside it names the step. */
export const PanelHeadingProvider = PanelHeadingContext.Provider;

/** Publishes to the enclosing panel. Returns false on surfaces without one. */
export function usePanelHeading({
  title,
  titleLabel,
  step,
}: PanelHeading): boolean {
  const publish = useContext(PanelHeadingContext);
  useLayoutEffect(() => {
    publish?.({ title, titleLabel, step });
    return () => publish?.({});
  }, [publish, title, titleLabel, step]);
  return publish !== null;
}
