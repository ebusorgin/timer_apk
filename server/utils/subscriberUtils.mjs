export const sanitizeDisplayName = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 64);
};

export const sortSubscribers = (items = []) =>
  [...items].sort((a, b) => {
    const nameA = (a.name || '').toLocaleLowerCase();
    const nameB = (b.name || '').toLocaleLowerCase();
    if (nameA === nameB) {
      return (a.createdAt || 0) - (b.createdAt || 0);
    }
    return nameA.localeCompare(nameB, 'ru');
  });

export default {
  sanitizeDisplayName,
  sortSubscribers,
};

