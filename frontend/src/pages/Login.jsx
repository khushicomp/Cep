import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          email,
          password,
        }
      );

      const role = res.data.role;
      const user = res.data.user;

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", role);
      if (user) {
        localStorage.setItem("user", JSON.stringify(user));
      }

      if (role === "EMPLOYEE") {
        navigate("/employee");
      } else if (role === "MANAGER") {
        navigate("/manager");
      } else if (role === "ADMIN") {
        navigate("/admin");
      }

    } catch (err) {
      console.error(err);
      alert("Invalid credentials or server error");
    }
  };

  return (
    <div className="login-container">
      <div className="login-content">
        <div className="content-wrapper">
          {/* Left Side - Welcome Section */}
          <div className="welcome-section">
            <div className="bank-logo">
              <img src="/images.png" alt="Bank Logo" className="logo-image" />
              <div className="bank-name">
                <h1>The Akola Urban</h1>
                <h2>Co-operative Bank Ltd.</h2>
              </div>
            </div>

            <div className="welcome-text">
              <h3>WELCOME TO AKOLA URBAN CO-OPERATIVE BANK</h3>
              <p className="tagline">
                <em>Efficiency. Transparency.</em>
                <br />
                <em>Accountability.</em>
              </p>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="login-section">
            <div className="login-card">
              <div className="user-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>

              <form onSubmit={handleLogin}>
                <div className="input-group">
                  <label htmlFor="email">Username:</label>
                  <input
                    type="email"
                    id="email"
                    placeholder="Enter your email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="password">Password:</label>
                  <input
                    type="password"
                    id="password"
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button type="submit" className="signin-btn">
                  Sign In
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;