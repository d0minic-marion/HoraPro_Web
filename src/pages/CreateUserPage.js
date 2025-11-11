import OvertimeSettingsCard from '../components/OvertimeSettingsCard';
import CreateEmployeeForm from '../components/CreateEmployeeForm';

function CreateUserPage() {
  return (
    <div className="animate-fade-in flex">


      <div className='pr-4'>
        <CreateEmployeeForm />
      </div>
      <div className='pl-4'>
        <OvertimeSettingsCard />
      </div>
      
      
    </div>
  );
}

export default CreateUserPage;
