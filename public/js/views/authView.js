import { CollectiumAPI } from '../api.js';

const messageBox = document.getElementById('message');

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = type;
  messageBox.style.display = 'block';
}

const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await CollectiumAPI.signup(username, email, password);
      showMessage('Account created! Redirecting to login...', 'success');
      setTimeout(() => (window.location.href = 'login.html'), 1200);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const data = await CollectiumAPI.login(email, password);
      showMessage(`Welcome back, ${data.profile.username}!`, 'success');
      setTimeout(() => {
        window.location.href = `profile.html?u=${encodeURIComponent(data.profile.username)}`;
      }, 600);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });
}
