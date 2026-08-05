export type PetAvatar = {
  id: string;
  label: string;
  vibe: string;
  src: string;
  bg: string;
};

/**
 * Bộ avatar động vật đồng bộ (~12 ảnh, tối đa 20).
 * Style: ảnh thực, crop vuông, nền studio mềm.
 */
export const PET_AVATARS: PetAvatar[] = [
  { id: "dog", label: "Chó vàng", vibe: "Thân thiện", src: "/avatars/pets/dog.webp", bg: "#E8EEF5" },
  { id: "cat", label: "Mèo xám", vibe: "Khó chịu", src: "/avatars/pets/cat.webp", bg: "#E6F4EE" },
  { id: "orangecat", label: "Mèo cam", vibe: "Tinh nghịch", src: "/avatars/pets/orangecat.webp", bg: "#F6EBE3" },
  { id: "tuxedocat", label: "Mèo tuxedo", vibe: "Sang chảnh", src: "/avatars/pets/tuxedocat.webp", bg: "#E9ECF0" },
  { id: "capybara", label: "Capybara", vibe: "Chill", src: "/avatars/pets/capybara.webp", bg: "#F3EDE3" },
  { id: "seal", label: "Hải cẩu", vibe: "Nghịch", src: "/avatars/pets/seal.webp", bg: "#ECEAF4" },
  { id: "bunny", label: "Thỏ", vibe: "Dễ thương", src: "/avatars/pets/bunny.webp", bg: "#F6E9EF" },
  { id: "panda", label: "Gấu trúc", vibe: "Hiền", src: "/avatars/pets/panda.webp", bg: "#E8F0EA" },
  { id: "fox", label: "Cáo", vibe: "Ranh mãnh", src: "/avatars/pets/fox.webp", bg: "#F4EFE6" },
  { id: "redpanda", label: "Gấu trúc đỏ", vibe: "Đáng yêu", src: "/avatars/pets/redpanda.webp", bg: "#F6EBE3" },
  { id: "otter", label: "Rái cá", vibe: "Vui vẻ", src: "/avatars/pets/otter.webp", bg: "#E5F1F3" },
  { id: "raccoon", label: "Gấu mèo", vibe: "Tinh quái", src: "/avatars/pets/raccoon.webp", bg: "#E9ECF0" },
];

export const PET_AVATAR_BY_ID: Record<string, PetAvatar> = Object.fromEntries(
  PET_AVATARS.map((pet) => [pet.id, pet]),
);

export const DEFAULT_PET_AVATAR = PET_AVATARS[0];

/** Màu chart theo roster memberId (không gắn ảnh người). */
export const CHART_COLORS: Record<string, string> = {
  hung: "#2563EB",
  thao: "#059669",
  thinh: "#D97706",
  thuy: "#DB2777",
};

export function chartColorOf(memberId: string): string {
  return CHART_COLORS[memberId] || "#64748B";
}

export function isPetAvatarSrc(src: string | null | undefined): boolean {
  const value = String(src || "").trim();
  return PET_AVATARS.some((pet) => pet.src === value);
}

export function petAvatarFromSrc(src: string | null | undefined): PetAvatar | null {
  const value = String(src || "").trim();
  return PET_AVATARS.find((pet) => pet.src === value) || null;
}

export function petAvatarById(id: string | null | undefined): PetAvatar | null {
  const value = String(id || "").trim();
  return PET_AVATAR_BY_ID[value] || null;
}

/** Fallback ổn định theo memberId khi chưa chọn avatar. */
export function defaultPetForMember(memberId: string | null | undefined): PetAvatar {
  const key = String(memberId || "member");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i) * (i + 1)) % PET_AVATARS.length;
  }
  return PET_AVATARS[hash] || DEFAULT_PET_AVATAR;
}

export function resolvePetAvatar(options: {
  photoURL?: string | null;
  memberId?: string | null;
}): PetAvatar {
  const fromPhoto = petAvatarFromSrc(options.photoURL);
  if (fromPhoto) return fromPhoto;
  return defaultPetForMember(options.memberId);
}
