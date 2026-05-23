import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const login = (username, password) =>
  api.post('/auth/login', { username, password }).then(r => r.data);

export const register = (data) =>
  api.post('/auth/register', data).then(r => r.data);

export const getMe = () =>
  api.get('/auth/me').then(r => r.data);

export const getUsers = () =>
  api.get('/auth/users').then(r => r.data);

export const updateUser = (id, data) =>
  api.put(`/auth/users/${id}`, data).then(r => r.data);

export const deleteUser = (id) =>
  api.delete(`/auth/users/${id}`).then(r => r.data);

/**
 * Score a WGS84 coordinate pair
 * @param {number} lon
 * @param {number} lat
 */
export const scoreCoordinate = (lon, lat) =>
  api.post('/score/coordinate', { lon, lat }).then(r => r.data);

/**
 * Score an existing inactive local by ID
 * @param {number} id
 */
export const scoreLocal = (id) =>
  api.get(`/score/local/${id}`).then(r => r.data);

/**
 * Search and filter available locals
 * @param {object} params
 */
export const searchLocals = (params = {}) =>
  api.get('/search', { params }).then(r => r.data);

/**
 * Get all zone names
 */
export const getZones = () =>
  api.get('/search/zones').then(r => r.data);

/**
 * Get inactive locals as GeoJSON
 */
export const getInactiveLocalsGeoJSON = () =>
  api.get('/search/locals/inactive').then(r => r.data);

/**
 * Get active competitors as GeoJSON
 */
export const getActiveLocalsGeoJSON = () =>
  api.get('/search/locals/active').then(r => r.data);

/**
 * Get POIs as GeoJSON
 */
export const getPOIsGeoJSON = () =>
  api.get('/search/pois').then(r => r.data);

/**
 * Get zones as GeoJSON
 */
export const getZonesGeoJSON = () =>
  api.get('/search/zones/geojson').then(r => r.data);

/**
 * Get road network (RX_ROUTIER) as GeoJSON lines
 */
export const getRoadsGeoJSON = () =>
  api.get('/search/roads').then(r => r.data);

/**
 * Get population clusters as GeoJSON points
 */
export const getPopulationGeoJSON = () =>
  api.get('/search/population').then(r => r.data);

/**
 * Get buffers as GeoJSON
 */
export const getBuffersGeoJSON = () =>
  api.get('/search/buffers').then(r => r.data);

/**
 * Get accessibility as GeoJSON
 */
export const getAccessibiliteGeoJSON = () =>
  api.get('/search/accessibilite').then(r => r.data);

// ── Manage: Locals ──────────────────────────────────────────
export const listLocals      = ()         => api.get('/manage/locals').then(r => r.data);
export const createLocal     = (body)     => api.post('/manage/locals', body).then(r => r.data);
export const updateLocal     = (id, body) => api.put(`/manage/locals/${id}`, body).then(r => r.data);
export const deleteLocal     = (id)       => api.delete(`/manage/locals/${id}`).then(r => r.data);

// ── Manage: POIs ────────────────────────────────────────────
export const listPOIs        = ()         => api.get('/manage/pois').then(r => r.data);
export const createPOI       = (body)     => api.post('/manage/pois', body).then(r => r.data);
export const updatePOI       = (id, body) => api.put(`/manage/pois/${id}`, body).then(r => r.data);
export const deletePOI       = (id)       => api.delete(`/manage/pois/${id}`).then(r => r.data);

export default api;
