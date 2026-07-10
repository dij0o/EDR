
import NewPatientDialog1 from "./NewPatientDialog1";
import NewPatientDialog2 from "./NewPatientDialog2";
import { useState } from "react";
import { blockchainUrl, jsonHeaders } from "../../config/api.js";

const NewPatientDialog = () => {
    const storedUser = (() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch {
            return {};
        }
    })();
    const [formData, setFormData] = useState({
        patientID: '',
        fullName: '',
        emiratesID: '',
        dateOfBirth: '',
        gender: '',
        address: '',
        email: '',
        contactNumber: '',
        clinicID: storedUser.organizationId ? String(storedUser.organizationId) : '',
    });

    const handleFieldChange = (event) => {
        const { name, value } = event.target;
        setFormData((current) => ({ ...current, [name]: value }));
    };

    const handleSubmitPatient = async () => {
        const requiredFields = ['patientID', 'fullName', 'emiratesID', 'dateOfBirth', 'gender', 'address', 'email', 'contactNumber', 'clinicID'];
        const missingField = requiredFields.find((field) => !formData[field]);

        if (missingField) {
            alert('Please complete all required patient fields before submitting.');
            return;
        }

        const [firstName, ...lastNameParts] = formData.fullName.trim().split(/\s+/);
        const lastName = lastNameParts.join(' ') || firstName;

        try {
            const response = await fetch(blockchainUrl('/addPatient'), {
                method: 'POST',
                headers: jsonHeaders(),
                body: JSON.stringify({
                    patientID: formData.patientID,
                    firstName,
                    lastName,
                    dateOfBirth: formData.dateOfBirth,
                    gender: formData.gender,
                    emiratesID: formData.emiratesID,
                    email: formData.email,
                    contactNumber: formData.contactNumber,
                    address: formData.address,
                    clinicID: formData.clinicID,
                    doctors: [],
                }),
            });
            const data = await response.json();

            if (!response.ok) {
                alert(data.error || 'Failed to add patient.');
                return;
            }

            alert(`Patient ${data.patientID} added successfully.`);
            window.location.reload();
        } catch (error) {
            console.error('Failed to add patient:', error);
            alert('Failed to add patient. Please try again later.');
        }
    };

    const PersonalInfoObj = {
        header: 'Personal Info',
        inputs: [
            {
                header: 'Patient ID',
                type: 'text',
                name: 'patientID',
                classes: { w60: true },
                placeholder: 'e.g. Patient4'
            },
            {
                header: 'Full Name',
                type: 'text',
                name: 'fullName',
                classes:  ['grow'] ,
                placeholder: 'Full name'
            },
            {
                header: 'Emirates Id',
                type: 'text',
                name: 'emiratesID',
                classes: { w60: true },
                placeholder: 'XXX-XXXXXXXXXXX-X'
            },
            {
                header: 'Date of Birth',
                type: 'date',
                name: 'dateOfBirth',
                classes: {}
            },
            {
                header: 'Gender',
                type: 'select',
                name: 'gender',
                classes: {},
                options: ['Female', 'Male']
            },
            {
                header: 'Nationality',
                type: 'select',
                classes: {},
                options: ['Female', 'Male']
            },
            {
                header: 'City',
                type: 'text',
                classes: {},
                placeholder: 'e.g. Ajman, Dubai'
            },
            {
                header: 'Address',
                type: 'text',
                name: 'address',
                classes:  ['grow'] ,
                placeholder: 'e.g. Barsha, Jumairah'
            },
            {
                header: 'Email',
                type: 'text',
                name: 'email',
                classes: {},
                placeholder: 'example@gmail.com'
            },
            {
                header: 'Phone Number',
                type: 'text',
                name: 'contactNumber',
                classes: {},
                placeholder: '05XXXXXXXX'
            },
            {
                header: 'Clinic ID',
                type: 'text',
                name: 'clinicID',
                classes: {},
                placeholder: 'e.g. 1'
            }
        ]
    }
    const MedicalInfoObj = {
        header: 'Medical Info',
        inputs: [
            {
                header: 'Blood Type',
                type: 'select',
                classes: ['w-10'],
                options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
            },
            {
                header: 'Height',
                type: 'number',
                classes: ['w-36'],
                placeholder: 'e.g. 170 cm'
            },
            {
                header: 'Weight',
                type: 'number',
                classes: ['grow'],
                placeholder: 'e.g. 70 kg'
            },
            {
                header: 'Allergies',
                type: 'textarea',
                classes:  ['grow'] ,
                placeholder: 'Known allergies, e.g., penicillin, nuts'
            },
            {
                header: 'Current Medications',
                type: 'textarea',
                classes:  ['grow'] ,
                placeholder: 'e.g., Paracetamol 500mg daily'
            },
            {
                header: 'Immunizations',
                type: 'textarea',
                classes:  ['grow'] ,
                placeholder: 'e.g., Flu shot, COVID-19 vaccine'
            },
            {
                header: 'Ongoing Treatments',
                type: 'textarea',
                classes:  ['grow'] ,
                placeholder: 'e.g., Physical therapy, chemotherapy'
            },
            {
                header: 'Doctor Notes',
                type: 'textarea',
                classes:  ['grow'] ,
                placeholder: 'Additional notes from the doctor'
            }
        ]
        
    }

    const InusranceInfoObj = {
        header: 'Insurance',
        inputs: [
            {
                header: 'Insurance Provider',
                type: 'text',
                classes: ['grow'],
                placeholder: 'e.g., Emirates Insurance, Daman'
            },
            {
                header: 'Policy Number',
                type: 'text',
                classes: ['grow'],
                placeholder: 'e.g., 1234567890'
            },
            {
                header: 'Coverage Type',
                type: 'select',
                classes:['grow'],
                options: ['Basic', 'Standard', 'Premium', 'Comprehensive']
            },
            {
                header: 'Effective Date',
                type: 'date',
                classes: ['grow']
            },
            {
                header: 'Expiration Date',
                type: 'date',
                classes: ['grow']
            },
            {
                header: 'Primary Insured Name',
                type: 'text',
                classes: ['grow'],
                placeholder: 'e.g., John Doe'
            },
            {
                header: 'Relationship to Primary Insured',
                type: 'select',
                classes: { w60: true },
                options: ['Self', 'Spouse', 'Child', 'Other']
            },
            {
                header: 'Deductible Amount',
                type: 'text',
                classes: {},
                placeholder: 'e.g., AED 500'
            },
            {
                header: 'Co-pay Percentage',
                type: 'text',
                classes: {},
                placeholder: 'e.g., 20%'
            },
        ]
        
    }




    return (
        <div id='AddNewPatientDialog' className='fixed bg-white drop-shadow-xl w-[68em] h-[36em] inset-1/2 -translate-x-1/2 translate-y-[30em] z-50 rounded-md opacity-0 grid grid-cols-12 gap-x-6 overflow-hidden' style={{gridTemplateColumns: '3fr 7fr'}}>
            <NewPatientDialog1 />
            <div className="h-[36em] overflow-y-scroll no-scrollbar">
                <NewPatientDialog2 dialogStructure={PersonalInfoObj} values={formData} onFieldChange={handleFieldChange} buttonTextP={''} buttonTextN={'Next'} hashhN={'#sp2'} dialogSectionId={'addNewPatient'} />
                <NewPatientDialog2 dialogStructure={MedicalInfoObj} buttonTextP={'Prev'}  buttonTextN={'Next'} hashhP={'#addNewPatient'} hashhN={'#sp3'} dialogSectionId={'sp2'} />
                <NewPatientDialog2 dialogStructure={InusranceInfoObj} buttonTextP={'Prev'}  buttonTextN={'Submit'} hashhP={'#sp2'} hashhN={'#'} dialogSectionId={'sp3'} onSubmit={handleSubmitPatient} />
            </div>

        </div>
    )
}


export default NewPatientDialog;
