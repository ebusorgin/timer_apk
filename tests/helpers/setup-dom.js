/**
 * Настройка DOM окружения для тестов
 */

export function setupDOM() {
  // Очищаем DOM перед каждым тестом
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  // Создаем базовую структуру HTML
  const app = document.createElement('div');
  app.id = 'app';

  // Login Screen
  const loginScreen = document.createElement('div');
  loginScreen.id = 'loginScreen';
  loginScreen.className = 'screen active';
  
  const loginContainer = document.createElement('div');
  loginContainer.className = 'login-container';
  
  const usernameInput = document.createElement('input');
  usernameInput.id = 'username';
  usernameInput.type = 'text';
  usernameInput.placeholder = 'Введите ваше имя';
  
  const btnCreateRoom = document.createElement('button');
  btnCreateRoom.id = 'btnCreateRoom';
  btnCreateRoom.className = 'btn btn-primary';
  
  const btnJoinRoom = document.createElement('button');
  btnJoinRoom.id = 'btnJoinRoom';
  btnJoinRoom.className = 'btn btn-secondary';
  
  const btnJoinRoomNow = document.createElement('button');
  btnJoinRoomNow.id = 'btnJoinRoomNow';
  btnJoinRoomNow.className = 'btn btn-primary';
  
  const roomIdInput = document.createElement('input');
  roomIdInput.id = 'roomId';
  roomIdInput.type = 'text';
  roomIdInput.placeholder = 'Введите код комнаты';
  
  const joinContainer = document.createElement('div');
  joinContainer.id = 'joinContainer';
  joinContainer.style.display = 'none';
  joinContainer.appendChild(roomIdInput);
  joinContainer.appendChild(btnJoinRoomNow);
  
  loginContainer.appendChild(usernameInput);
  loginContainer.appendChild(btnCreateRoom);
  loginContainer.appendChild(btnJoinRoom);
  loginContainer.appendChild(joinContainer);
  loginScreen.appendChild(loginContainer);
  app.appendChild(loginScreen);

  // Room Screen
  const roomScreen = document.createElement('div');
  roomScreen.id = 'roomScreen';
  roomScreen.className = 'screen';
  
  const usersGrid = document.createElement('div');
  usersGrid.id = 'usersGrid';
  usersGrid.className = 'users-grid';
  
  const btnLeaveRoom = document.createElement('button');
  btnLeaveRoom.id = 'btnLeaveRoom';
  btnLeaveRoom.className = 'btn btn-danger btn-small';
  
  const btnToggleMic = document.createElement('button');
  btnToggleMic.id = 'btnToggleMic';
  btnToggleMic.className = 'control-btn';
  
  const statusMessage = document.createElement('div');
  statusMessage.id = 'statusMessage';
  statusMessage.className = 'status-message';
  
  const currentRoomIdSpan = document.createElement('span');
  currentRoomIdSpan.id = 'currentRoomId';
  
  const roomLinkInput = document.createElement('input');
  roomLinkInput.id = 'roomLink';
  roomLinkInput.type = 'text';
  roomLinkInput.readOnly = true;
  
  const roomLinkContainer = document.createElement('div');
  roomLinkContainer.id = 'roomLinkContainer';
  roomLinkContainer.style.display = 'none';
  roomLinkContainer.appendChild(roomLinkInput);
  
  const btnCopyLink = document.createElement('button');
  btnCopyLink.id = 'btnCopyLink';
  btnCopyLink.className = 'btn btn-small';
  
  const userCount = document.createElement('span');
  userCount.id = 'userCount';
  
  roomScreen.appendChild(usersGrid);
  roomScreen.appendChild(btnLeaveRoom);
  roomScreen.appendChild(btnToggleMic);
  roomScreen.appendChild(statusMessage);
  roomScreen.appendChild(currentRoomIdSpan);
  roomScreen.appendChild(roomLinkContainer);
  roomScreen.appendChild(btnCopyLink);
  roomScreen.appendChild(userCount);
  app.appendChild(roomScreen);

  document.body.appendChild(app);

  // Настройка window для App модуля
  if (typeof window !== 'undefined') {
    window.location = {
      origin: 'http://localhost:3000',
      search: ''
    };
  }
}