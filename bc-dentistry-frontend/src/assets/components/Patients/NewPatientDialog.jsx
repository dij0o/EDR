import { useState } from 'react';
import { databaseUrl, jsonHeaders } from '../../config/api.js';
import { getStoredUser } from '../../utils/auth.js';

const empty = {
    firstName: '', lastName: '', dateOfBirth: '', gender: '', contactNumber: '', email: '', password: '',
    emiratesID: '', nationality: '', address: '', bloodType: '', medicalHistory: '', allergies: '', medications: '',
    insuranceProvider: '', policyNumber: '', coverageType: '', clinicID: '', doctors: ''
};

const NewPatientDialog = ({ onSaved }) => {
    const user = getStoredUser();
    const [form, setForm] = useState({ ...empty, clinicID: user?.organizationId || '' });
    const [status, setStatus] = useState({ loading: false, error: '' });
    const set = (name) => (event) => setForm((value) => ({ ...value, [name]: event.target.value }));

    const submit = async (event) => {
        event.preventDefault(); setStatus({ loading: true, error: '' });
        const payload = {
            ...form,
            clinicID: Number(form.clinicID),
            medicalHistory: form.medicalHistory.split('\n').filter(Boolean),
            allergies: form.allergies.split('\n').filter(Boolean),
            medications: form.medications.split('\n').filter(Boolean),
            insuranceDetails: { provider: form.insuranceProvider, policyNumber: form.policyNumber, coverageType: form.coverageType },
            doctors: form.doctors.split(',').map((item) => item.trim()).filter(Boolean)
        };
        try {
            const response = await fetch(databaseUrl('/patients'), { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result?.error?.message || 'Unable to create patient');
            setForm({ ...empty, clinicID: user?.organizationId || '' });
            window.location.hash = '';
            onSaved?.(result.data);
        } catch (error) { setStatus({ loading: false, error: error.message }); return; }
        setStatus({ loading: false, error: '' });
    };

    const fields = [
        ['firstName','First name','text'], ['lastName','Last name','text'], ['dateOfBirth','Date of birth','date'],
        ['gender','Gender','text'], ['contactNumber','Contact number','tel'], ['email','Email','email'],
        ['password','Temporary password','password'], ['emiratesID','Emirates ID','text'], ['nationality','Nationality','text'],
        ['address','Address','text'], ['bloodType','Blood type (A+, O-, etc.)','text'], ['insuranceProvider','Insurance provider','text'],
        ['policyNumber','Policy number','text'], ['coverageType','Coverage type','text'], ['doctors','Doctor IDs (comma-separated)','text']
    ];
    return <div id="AddNewPatientDialog" className="fixed bg-white drop-shadow-xl w-[68em] max-w-[95vw] h-[36em] inset-1/2 -translate-x-1/2 translate-y-[30em] z-50 rounded-md opacity-0 overflow-y-auto p-8">
        <form onSubmit={submit} aria-label="Add patient">
            <div className="flex justify-between"><h1 className="text-3xl font-bold">Add patient</h1><a href="#" aria-label="Close">Close</a></div>
            <p className="my-3 text-sm text-gray-600">PII and clinical details are stored in MySQL. Fabric stores only a reference and SHA-256 hash.</p>
            <div className="grid grid-cols-3 gap-4">
                {fields.map(([name,label,type]) => <label key={name} className="text-sm">{label}<input required className="block border rounded p-2 w-full" type={type} value={form[name]} onChange={set(name)} /></label>)}
                {['medicalHistory','allergies','medications'].map((name) => <label key={name} className="text-sm capitalize">{name.replace(/([A-Z])/g,' $1')} (one per line)<textarea required className="block border rounded p-2 w-full" value={form[name]} onChange={set(name)} /></label>)}
            </div>
            {status.error && <p role="alert" className="text-red-700 mt-3">{status.error}</p>}
            <button disabled={status.loading} className="bg-[#000834] text-white px-6 py-3 rounded mt-5">{status.loading ? 'Creating…' : 'Create patient'}</button>
        </form>
    </div>;
};

export default NewPatientDialog;
