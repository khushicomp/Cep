import { useEffect, useState } from "react";
import { getMyTasks, updateTask } from "../services/taskService";

function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await getMyTasks();
      setTasks(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (taskId, status, time_taken) => {
    if (!status || !time_taken) {
      alert("Please select status and enter time");
      return;
    }

    try {
      await updateTask(taskId, {
        status,
        time_taken: Number(time_taken),
      });

      alert("Task updated successfully!");
      fetchTasks();
    } catch (err) {
      console.error(err);
      alert("Update failed");
    }
  };

  if (loading) return <p>Loading tasks...</p>;

  if (tasks.length === 0) return <p>No tasks assigned yet.</p>;

  return (
    <div>
      <h3>My Tasks</h3>

      <table border="1" cellPadding="10" width="100%">
        <thead>
          <tr>
            <th>Task Name</th>
            <th>Assigned Date</th>
            <th>Total Time</th>
            <th>Current Status</th>
            <th>Update</th>
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => {
            let selectedStatus = "";
            let timeInput = "";

            return (
              <tr key={task.task_id}>
                <td>{task.task_name}</td>
                <td>{task.assigned_date}</td>
                <td>{task.total_time} mins</td>
                <td>{task.current_status || "PENDING"}</td>

                <td>
                  <select
                    onChange={(e) => (selectedStatus = e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>

                  <input
                    type="number"
                    placeholder="Time (mins)"
                    onChange={(e) => (timeInput = e.target.value)}
                    style={{ marginLeft: "10px", width: "80px" }}
                  />

                  <button
                    onClick={() =>
                      handleUpdate(task.task_id, selectedStatus, timeInput)
                    }
                    style={{ marginLeft: "10px" }}
                  >
                    Save
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default MyTasks;
