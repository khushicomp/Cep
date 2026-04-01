import { useNavigate } from "react-router-dom";

function Sidebar() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
        <div style={{
        width: "200px",
        background: "#1e293b",
        color: "white",
        height: "100vh",
        padding: "20px"
        }}>
        <h3>Dashboard</h3>

        <button onClick={() => navigate("/employee")}>
            Home
        </button>

        <br /><br />

        <button onClick={logout}>
            Logout
        </button>
        </div>
    );
}

export default Sidebar;
