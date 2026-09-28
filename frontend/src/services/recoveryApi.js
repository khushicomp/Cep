import axios from 'axios';
import { apiBaseUrl } from './endpoint';

// Deliberately separate from the authenticated client: no bearer/header interceptor or 401 redirect.
export default axios.create({ baseURL: apiBaseUrl, timeout: 15000 });
