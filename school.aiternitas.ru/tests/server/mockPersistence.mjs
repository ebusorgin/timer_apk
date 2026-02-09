export function createMockPersistence() {
  const users = new Map();
  const programs = [
    { id: '1', title: 'Test Program', slug: 'test', description: 'Desc', ageMin: 5, ageMax: 18, durationWeeks: 12, schoolType: 'tech', curriculum: [{ n: 1, topic: 'Intro' }, { n: 2, topic: 'Basics' }] },
  ];
  const schoolTypes = [
    { id: 'tech', title: 'Техническое направление', sortOrder: 0, description: '' },
    { id: 'art', title: 'Художественная школа', sortOrder: 1, description: '' },
  ];
  const groups = [
    { id: '1', programId: '1', title: 'Group A', schedule: 'Mon 10:00', maxStudents: 10, status: 'active' },
  ];
  const enrollments = [];
  const homework = [];
  const announcements = [];
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
    updateUser: async (id, updates) => {
      let u = null;
      for (const x of users.values()) if (String(x.id) === String(id)) { u = x; break; }
      if (!u) return null;
      if (updates?.name != null) u.name = updates.name;
      return u;
    },
    getPrograms: async () => programs,
    getProgramById: async (id) => programs.find((p) => String(p.id) === String(id)) || null,
    getSchoolTypes: async () => schoolTypes,
    getGroupsByProgramId: async (programId) => groups.filter((g) => String(g.programId) === String(programId)),
    getAllGroups: async () => groups.map((g) => ({ ...g, programTitle: 'Test Program' })),
    getEnrollmentsByUserId: async (userId) => {
      const uid = String(userId);
      return enrollments.filter((e) => String(e.userId) === uid).map((e) => ({
        ...e,
        programTitle: programs.find((p) => String(p.id) === String(e.programId))?.title || '',
        groupTitle: groups.find((g) => String(g.id) === String(e.groupId))?.title || '',
        groupSchedule: groups.find((g) => String(g.id) === String(e.groupId))?.schedule || '',
        nextLessonN: 1,
        nextLessonTopic: 'Intro',
      }));
    },
    enrollUser: async (userId, programId, groupId) => {
      const existing = enrollments.find((e) => String(e.userId) === String(userId) && String(e.programId) === String(programId));
      if (existing) return existing;
      const p = programs.find((pr) => String(pr.id) === String(programId));
      if (!p) return null;
      const e = { id: String(++idCounter), userId, programId, groupId: groupId || null, status: 'active', progress: 0, enrolledAt: Date.now() };
      enrollments.push(e);
      return e;
    },
    getHomeworkByUserId: async (userId) => homework.filter((h) => {
      const e = enrollments.find((x) => String(x.userId) === String(userId) && String(x.groupId) === String(h.groupId));
      return !!e;
    }).map((h) => ({ ...h, groupTitle: 'Group A', programTitle: 'Test Program' })),
    getAnnouncementsByUserId: async (userId) => announcements.filter((a) => {
      const e = enrollments.find((x) => String(x.userId) === String(userId));
      return e && ((a.groupId && String(e.groupId) === String(a.groupId)) || (a.programId && String(e.programId) === String(a.programId)));
    }).map((a) => ({ ...a, groupTitle: a.groupId ? 'Group A' : '', programTitle: 'Test Program' })),
    createAnnouncement: async (data) => {
      if (!data.groupId && !data.programId) return null;
      const a = { id: String(++idCounter), groupId: data.groupId || null, programId: data.programId || null, title: data.title || '', body: data.body || '', createdAt: Date.now() };
      announcements.push(a);
      return a;
    },
    getAllEnrollments: async () => enrollments.map((e) => {
      const u = [...users.values()].find((x) => String(x.id) === String(e.userId));
      const p = programs.find((pr) => String(pr.id) === String(e.programId));
      const g = groups.find((gr) => String(gr.id) === String(e.groupId));
      return { ...e, studentName: u?.name || '', studentEmail: u?.email || '', programTitle: p?.title || '', groupId: e.groupId, groupTitle: g?.title };
    }),
    updateEnrollmentGroup: async (enrollmentId, groupId) => {
      const e = enrollments.find((x) => String(x.id) === String(enrollmentId));
      if (!e) return null;
      e.groupId = groupId || null;
      return e;
    },
    updateEnrollmentProgress: async (enrollmentId, progress) => {
      const e = enrollments.find((x) => String(x.id) === String(enrollmentId));
      if (!e) return null;
      e.progress = Math.min(100, Math.max(0, Number(progress) || 0));
      return e;
    },
    getHomeworkByGroupId: async (groupId) => homework.filter((h) => String(h.groupId) === String(groupId)),
    createHomework: async (data) => {
      const h = { id: String(++idCounter), ...data, createdAt: Date.now() };
      homework.push(h);
      return h;
    },
    deleteHomework: async (id) => {
      const idx = homework.findIndex((h) => String(h.id) === String(id));
      if (idx < 0) return false;
      homework.splice(idx, 1);
      return true;
    },
  };
}
