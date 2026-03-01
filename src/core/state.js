import { isAdminProfile, normalizeMemberRole } from "./roles";

export const state = {
  user: null,
  groupId: null,
  members: [],
  memberProfile: null,
  isAdmin: false,
};

export function setUser(user) {
  state.user = user;
}

export function setGroup(groupId) {
  state.groupId = groupId;
}

export function setMembers(members) {
  state.members = members;
}

export function setMemberProfile(profile) {
  if (!profile) {
    state.memberProfile = null;
    state.isAdmin = false;
    return;
  }

  state.memberProfile = {
    ...profile,
    role: normalizeMemberRole(profile),
  };
  state.isAdmin = isAdminProfile(state.memberProfile);
}
