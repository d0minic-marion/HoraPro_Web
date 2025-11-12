import OvertimeSettingsCard from '../components/OvertimeSettingsCard';
import CreateEmployeeForm from '../components/CreateEmployeeForm';

function CreateUserPage() {
  return (
    <div className="container-fluid my-45">
      <div className="row g-4">
        {/* Colonne gauche */}
        <div className="col-12 col-md-6">
          <div className="card">
            <div className="card-body">
              <CreateEmployeeForm />
            </div>
          </div>
        </div>

        {/* Colonne droite */}
        <div className="col-12 col-md-6">
          <div className="card">
            <div className="card-body">
              <OvertimeSettingsCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateUserPage;
