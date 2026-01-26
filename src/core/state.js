export const state = {
  user: null,
  groupId: null,
  members: [],
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
