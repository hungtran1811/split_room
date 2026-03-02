import {
  canOperateMonth,
  isAdminProfile,
  isOwnerProfile,
  normalizeMemberRole,
} from "./roles";

export const state = {
  user: null,
  groupId: null,
  members: [],
  memberProfile: null,
  isAdmin: false,
  isOwner: false,
  canOperateMonth: false,
};

export function setUser(user) {
  state.user = user;
}

export function setGroup(groupId) {
  state.groupId = groupId;
}

export function setMembers(members) {
  state.members = (members || []).map((member) => ({
    ...member,
    role: normalizeMemberRole(member),
  }));
}

export function setMemberProfile(profile) {
  if (!profile) {
    state.memberProfile = null;
    state.isAdmin = false;
    state.isOwner = false;
    state.canOperateMonth = false;
    return;
  }

  state.memberProfile = {
    ...profile,
    role: normalizeMemberRole(profile),
  };
  state.isOwner = isOwnerProfile(state.memberProfile);
  state.canOperateMonth = canOperateMonth(state.memberProfile);
  state.isAdmin = isAdminProfile(state.memberProfile);
}
