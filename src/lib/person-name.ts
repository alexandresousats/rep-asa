export function splitPersonName(full: string) {
  const trimmed = full.trim();
  const space = trimmed.indexOf(" ");
  if (space <= 0) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function joinPersonName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function displayPersonName(user: {
  firstName?: string;
  lastName?: string;
  name: string;
}) {
  if (user.firstName) {
    return joinPersonName(user.firstName, user.lastName ?? "");
  }
  return user.name;
}
