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
    // Создаем объект location с возможностью изменения pathname
    let currentPathname = '/';
    let currentSearch = '';
    
    // Создаем функцию для обновления location
    const updateLocation = () => {
      Object.defineProperty(window, 'location', {
        value: {
          origin: 'http://localhost:3000',
          href: `http://localhost:3000${currentPathname}${currentSearch}`,
          get pathname() {
            return currentPathname;
          },
          get search() {
            return currentSearch;
          },
          get href() {
            return `http://localhost:3000${currentPathname}${currentSearch ? '?' + currentSearch : ''}`;
          }
        },
        writable: true,
        configurable: true
      });
    };
    
    updateLocation();
    
    // Переопределяем replaceState для обновления нашего location
    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = function(state, title, url) {
      if (url) {
        try {
          const urlObj = new URL(url, 'http://localhost:3000');
          currentPathname = urlObj.pathname;
          currentSearch = urlObj.search.substring(1); // Убираем '?'
          updateLocation();
        } catch (e) {
          // Если URL относительный, парсим его вручную
          if (url.startsWith('/')) {
            const parts = url.split('?');
            currentPathname = parts[0];
            currentSearch = parts[1] || '';
            updateLocation();
          }
        }
      }
      return originalReplaceState(state, title, url);
    };
  }
}