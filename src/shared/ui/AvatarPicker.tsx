import { PET_AVATARS, resolvePetAvatar } from "../../config/avatars";

type AvatarPickerProps = {
  selectedSrc?: string | null;
  memberId?: string | null;
  disabled?: boolean;
  onSelect: (petId: string) => void;
};

export function AvatarPicker({
  selectedSrc,
  memberId,
  disabled = false,
  onSelect,
}: AvatarPickerProps) {
  const current = resolvePetAvatar({ photoURL: selectedSrc, memberId });

  return (
    <div className="avatar-picker" role="listbox" aria-label="Chọn avatar thú cưng">
      {PET_AVATARS.map((pet) => {
        const selected = pet.id === current.id;
        return (
          <button
            key={pet.id}
            type="button"
            role="option"
            aria-selected={selected}
            className={`avatar-picker__item ${selected ? "is-selected" : ""}`.trim()}
            disabled={disabled}
            onClick={() => onSelect(pet.id)}
          >
            <img src={pet.src} alt={pet.label} style={{ background: pet.bg }} />
            <span>{pet.label}</span>
            <span className="avatar-picker__vibe">{pet.vibe}</span>
          </button>
        );
      })}
    </div>
  );
}
