import { resolvePetAvatar } from "../../config/avatars";
import { nameOf } from "../../config/roster";
import { useSession } from "../../app/SessionContext";

type MemberAvatarProps = {
  memberId?: string | null;
  photoURL?: string | null;
  label?: string;
  size?: number;
  className?: string;
};

/** Avatar thú cưng — lấy từ photoURL đã chọn, hoặc fallback theo memberId. */
export function MemberAvatar({
  memberId,
  photoURL,
  label,
  size = 36,
  className = "",
}: MemberAvatarProps) {
  const session = useSession();
  const fromMembers = memberId
    ? session.members.find(
        (member) =>
          member.memberId === memberId ||
          member.id === memberId ||
          member.uid === memberId,
      )
    : null;

  const resolvedPhoto =
    photoURL ||
    (typeof fromMembers?.photoURL === "string" ? fromMembers.photoURL : "") ||
    (session.memberProfile?.memberId === memberId
      ? String(session.memberProfile?.photoURL || "")
      : "");

  const pet = resolvePetAvatar({
    photoURL: resolvedPhoto,
    memberId: memberId || String(fromMembers?.memberId || ""),
  });
  const title = label || (memberId ? nameOf(memberId) : pet.label);

  return (
    <img
      className={`member-avatar ${className}`.trim()}
      src={pet.src}
      alt={title}
      width={size}
      height={size}
      style={{ width: size, height: size, background: pet.bg }}
      loading="lazy"
      decoding="async"
    />
  );
}
