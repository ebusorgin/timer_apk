export function createMockPersistence() {
  const users = new Map();
  const programs = [
    { id: '1', title: 'Test Program', slug: 'test', description: 'Desc', ageMin: 5, ageMax: 18, direction: 'tech', durationWeeks: 12, schoolType: 'tech' },
  ];
  const schoolTypes = [
    { id: 'tech', title: 'Техническое направление', sortOrder: 0, description: '' },
    { id: 'art', title: 'Художественная школа', sortOrder: 1, description: '' },
  ];
  const directions = ['программирование', 'робототехника'];
  let idCounter = 100;

  return {
    getUserByEmail: async (email) => users.get(email?.toLowerCase()) || null,
    getUserById: async (id) => {
      for (const u of users.values()) {
        if (String(u.id) === String(id)) return u;
      }
      return null;
    },
    insertUser: async (data) => {
      const id = String(++idCounter);
      const user = {
        id,
        email: data.email,
        name: data.name,
        role: data.role || 'student',
        passwordHash: data.passwordHash,
      };
      users.set(data.email?.toLowerCase(), user);
      return user;
    },
    getPrograms: async () => programs,
    getProgramById: async (id) => programs.find((p) => String(p.id) === String(id)) || null,
    getSchoolTypes: async () => schoolTypes,
    getDirections: async () => directions,
  };
}
