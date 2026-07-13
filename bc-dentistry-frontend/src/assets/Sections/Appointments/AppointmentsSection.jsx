import { useState, useEffect } from 'react';
import { MainContainer } from "../../components";
import AppointmentTicket from "../../components/Appointments/AppointmentTicket";
import { authHeaders, databaseUrl, handleUnauthorizedResponse } from '../../config/api.js';

const AppointmentsSection = () => {
    // State to store fetched appointments data
    const [appointmentsTickets, setAppointmentsTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Fetch appointments from the backend API when the component mounts
    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                const response = await fetch(databaseUrl('/Appointment'), { headers: authHeaders() }); // Adjust the endpoint if needed
                handleUnauthorizedResponse(response);
                const data = await response.json();
                if (!response.ok || data?.success === false) {
                    throw new Error(data?.error?.message || 'Unable to load appointments.');
                }
                setAppointmentsTickets(Array.isArray(data?.data) ? data.data : []);
            } catch (error) {
                setError(error.message || 'Unable to load appointments.');
            } finally {
                setLoading(false);
            }
        };

        fetchAppointments();
    }, []);

    // Map fetched appointments to AppointmentTicket components
    const allAppointments = appointmentsTickets.map((appointment, index) => {
        return (
            <AppointmentTicket
                key={index}
                date={appointment.Date}
                reason={appointment.Meeting_For}
                dr={appointment.Doctor_ID}
                id={appointment.Appointment_ID}
                name={appointment.Patient_ID}
                status={appointment.status}
            />
        );
    });

    return (
        <MainContainer Id="AppointmentsSection" classes={'mt-6 gap-y-6'}>
            {loading && <p>Loading appointments...</p>}
            {!loading && error && <p role="alert">{error}</p>}
            {!loading && !error && allAppointments.length === 0 && <p>No appointments found.</p>}
            {!loading && !error && allAppointments}
        </MainContainer>
    );
};

export default AppointmentsSection;
