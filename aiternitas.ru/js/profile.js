// Личный кабинет

let currentUser = null;
let isEditingName = false;

document.addEventListener('DOMContentLoaded', async () => {
  await loadUserProfile();
  setupEventListeners();
});

async function loadUserProfile() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include' // Важно для отправки cookies
    });
    
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error('Ошибка загрузки профиля');
    }

    const data = await response.json();
    currentUser = data.user;

    // Отображаем данные
    document.getElementById('nameDisplay').textContent = currentUser.name || 'Не указано';
    document.getElementById('emailDisplay').textContent = currentUser.email || '';
    
    if (currentUser.created_at) {
      const date = new Date(currentUser.created_at);
      document.getElementById('createdAtDisplay').textContent = date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    // Устанавливаем аватар
    if (currentUser.avatar) {
      document.getElementById('avatarImg').src = currentUser.avatar;
    }
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    showMessage('Ошибка загрузки профиля', 'error');
  }
}

function setupEventListeners() {
  // Редактирование имени
  document.getElementById('editNameBtn').addEventListener('click', startEditingName);
  document.getElementById('saveNameBtn').addEventListener('click', saveName);
  document.getElementById('cancelNameBtn').addEventListener('click', cancelEditingName);
  
  const nameInput = document.getElementById('nameInput');
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveName();
    } else if (e.key === 'Escape') {
      cancelEditingName();
    }
  });

  // Загрузка аватара
  document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);

  // Выход
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

function startEditingName() {
  if (isEditingName) return;
  
  isEditingName = true;
  const nameContainer = document.getElementById('nameContainer');
  const nameDisplay = document.getElementById('nameDisplay');
  const nameInput = document.getElementById('nameInput');
  const editBtn = document.getElementById('editNameBtn');
  const editControls = document.getElementById('editControls');
  
  nameInput.value = currentUser.name || '';
  nameDisplay.style.display = 'none';
  editBtn.style.display = 'none';
  editControls.style.display = 'flex';
  nameContainer.classList.add('editing');
  
  nameInput.focus();
  nameInput.select();
}

function cancelEditingName() {
  if (!isEditingName) return;
  
  isEditingName = false;
  const nameContainer = document.getElementById('nameContainer');
  const nameDisplay = document.getElementById('nameDisplay');
  const nameInput = document.getElementById('nameInput');
  const editBtn = document.getElementById('editNameBtn');
  const editControls = document.getElementById('editControls');
  
  nameDisplay.style.display = 'inline';
  editControls.style.display = 'none';
  editBtn.style.display = 'flex';
  nameContainer.classList.remove('editing');
  nameInput.disabled = false;
  nameInput.style.opacity = '1';
  nameInput.value = currentUser.name || '';
}

async function saveName() {
  if (!isEditingName) return;
  
  const nameInput = document.getElementById('nameInput');
  const saveBtn = document.getElementById('saveNameBtn');
  const newName = nameInput.value.trim();
  
  if (!newName) {
    showMessage('Имя не может быть пустым', 'error');
    nameInput.focus();
    return;
  }

  if (newName === currentUser.name) {
    cancelEditingName();
    return;
  }

  // Показываем состояние загрузки
  nameInput.disabled = true;
  saveBtn.disabled = true;
  saveBtn.style.opacity = '0.6';

  try {
    const response = await fetch('/api/auth/profile/name', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ name: newName })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      currentUser.name = data.user.name;
      document.getElementById('nameDisplay').textContent = currentUser.name;
      showMessage('Имя успешно обновлено', 'success');
      
      // Выходим из режима редактирования
      isEditingName = false;
      const nameContainer = document.getElementById('nameContainer');
      const nameDisplay = document.getElementById('nameDisplay');
      const editBtn = document.getElementById('editNameBtn');
      const editControls = document.getElementById('editControls');
      
      nameDisplay.style.display = 'inline';
      editControls.style.display = 'none';
      editBtn.style.display = 'flex';
      nameContainer.classList.remove('editing');
      nameInput.disabled = false;
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
    } else {
      showMessage(data.error || 'Ошибка обновления имени', 'error');
      nameInput.disabled = false;
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
      nameInput.focus();
    }
  } catch (error) {
    showMessage('Ошибка подключения к серверу', 'error');
    nameInput.disabled = false;
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    nameInput.focus();
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  
  if (!file) return;

  // Валидация размера (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showMessage('Размер файла не должен превышать 5MB', 'error');
    return;
  }

  // Валидация типа
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    showMessage('Разрешены только изображения (jpeg, jpg, png, gif, webp)', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);

  const avatarImg = document.getElementById('avatarImg');
  avatarImg.style.opacity = '0.5';

  try {
    const response = await fetch('/api/upload/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await response.json();

    if (response.ok && data.success) {
      avatarImg.src = data.avatar;
      currentUser.avatar = data.avatar;
      showMessage('Аватар успешно загружен', 'success');
    } else {
      showMessage(data.error || 'Ошибка загрузки аватара', 'error');
    }
  } catch (error) {
    showMessage('Ошибка подключения к серверу', 'error');
  } finally {
    avatarImg.style.opacity = '1';
    e.target.value = ''; // Сброс input
  }
}

async function handleLogout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Ошибка выхода:', error);
  }
}

function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';

  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 5000);
}
