import api from "./api";

export const getMyTasks = async () => {
  return api.get("/tasks/my-tasks");
};

export const updateTask = async (taskId, data) => {
  return api.put(`/tasks/update/${taskId}`, data);
};
