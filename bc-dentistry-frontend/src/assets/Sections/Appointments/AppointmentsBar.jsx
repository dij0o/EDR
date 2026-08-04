import { AppointmentsControlBar } from "../../components";
import MainContainer from "../../components/MainContainer";
import AppointmentsStatstics from "./AppointmentsStatstics";


const AppointmentsBar = ({ appointments, loading, onCreated }) => {
    return (
        <MainContainer Id={"AppointmentControlBar"} classes={'gap-y-4'}>
            <AppointmentsControlBar onCreated={onCreated} />
            <AppointmentsStatstics appointments={appointments} loading={loading} />
        </MainContainer>
    )
}

export default AppointmentsBar;
