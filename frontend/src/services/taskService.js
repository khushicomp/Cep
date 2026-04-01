import axios from "axios";

const API_URL = "http://localhost:5000/api";

export const getMyTasks = async() =>{
    const token = localStorage.getItem("token");

    return axios.get(`${API_URL}/tasks/my-tasks`,{
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
};

export const updateTask = async (taskId, data) => {
    const token = localStorage.getItem("token");

    return axios.put(
        `${API_URL}/tasks/update/${taskId}`,
        data,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );
};