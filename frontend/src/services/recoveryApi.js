import axios from 'axios';

// Deliberately separate from the authenticated client: no bearer/header interceptor or 401 redirect.
export default axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api', timeout: 15000 });
