import type { ProfileIdentity, ProfileCategoryId } from "../model";

export interface ImportCandidate {
  readonly source: string;
  readonly rowIndex?: number;
  readonly profileFieldKey?: string;
  readonly status: "available" | "review" | "unsupported";
  readonly reason: string;
  readonly value?: string;
  readonly precision?: "month" | "day";
  readonly identity?: ProfileIdentity;
  readonly label?: string;
  readonly sectionId?: string;
  readonly categoryId?: ProfileCategoryId;
  readonly sensitive?: boolean;
  readonly reviewKind?: "koreanName" | "englishName";
  /** The source gave only a year and month; the day was filled with 01 (resume import). */
  readonly dayFilled?: boolean;
}
