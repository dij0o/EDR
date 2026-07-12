import { Routes, Route, useLocation } from "react-router-dom";
import { Home, Patients, Doctors, Appointments, DataRequests, LabResults, Settings, Info, Patient, Login, Signup } from "./assets/Pages"
import Navbar from "./assets/Sections/Navbar.jsx"
import Topbar from "./assets/Sections/Topbar.jsx"
import PagesCover from "./assets/Pages/PagesCover.jsx";
import { getStoredUserRole } from "./assets/utils/auth.js";

function App() {
  const homePaths = ["/", "/login", "/signup"]
  const location = useLocation();
  const isHomePath = homePaths.includes(location.pathname.toLowerCase());
  const role = getStoredUserRole();
  return (
    <div className="flex w-full p-5 h-[100vh]" style={{gridTemplateColumns: '1fr 5fr'}} >
      
      {!isHomePath && <PagesCover />}
      {!isHomePath && <Navbar />}
      <div className="rounded-md w-[86%] ml-[15.5%]">
      {/**!homePaths.includes(location.pathname) && <Topbar />**/}
          {!isHomePath && <Topbar />}
        <Routes>
          <Route path="/" element={<Login/>} /> 
          <Route path="/login" element={<Login/>} />
          <Route path="/signup" element={<Signup/>} />
          <Route path="/dashboard" element={<Home/>} />
          <Route path="/Appointments" element={<Appointments/>} />
          <Route path="/Patients" element={<Patients/>} />
          <Route path="/Patients/:id" element={<Patient/>} />
          {role === 'admin' && <Route path="/Doctors" element={<Doctors/>} />}
          {role === 'admin' && 
          <Route path="/DataRequests" element={<DataRequests/>} />
           } 
          <Route path="/LabResults" element={<LabResults/>} />
          <Route path="/Settings" element={<Settings/>} />
          <Route path="/Info" element={<Info/>} />
        </Routes>
      </div>
    </div>
  )
}

export default App;
