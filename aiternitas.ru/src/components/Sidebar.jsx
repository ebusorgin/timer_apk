import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

function Sidebar({ user, loading, onLogout, isOpen, onClose }) {
  const { logout } = useAuth();

  const handleLinkClick = () => {
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
    } else {
      await logout();
    }
    handleLinkClick();
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <Link to="/" className="sidebar-logo" onClick={handleLinkClick}>
        Aiternitas
      </Link>

      {loading ? null : user ? (
        <div className="user-section">
          <div className="user-info">
            <img
              src={user.avatar || '/images/default-avatar.png'}
              alt="Аватар"
              className="user-avatar"
            />
            <div className="user-details">
              <div className="user-name">{user.name}</div>
              <Link to="/profile" className="profile-link" onClick={handleLinkClick}>
                Личный кабинет
              </Link>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      ) : (
        <div className="auth-buttons">
          <Link to="/login" className="auth-btn login-btn" onClick={handleLinkClick}>
            Войти
          </Link>
          <Link to="/register" className="auth-btn register-btn" onClick={handleLinkClick}>
            Регистрация
          </Link>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;

