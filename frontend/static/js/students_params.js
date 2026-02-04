// Заполнение полей параметров ученика при редактировании
function fillStudentParameters(student) {
    if (document.getElementById('edit_height')) {
        document.getElementById('edit_height').value = student.height || '';
    }
    if (document.getElementById('edit_weight')) {
        document.getElementById('edit_weight').value = student.weight || '';
    }
    if (document.getElementById('edit_jersey_size')) {
        document.getElementById('edit_jersey_size').value = student.jersey_size || '';
    }
    if (document.getElementById('edit_shorts_size')) {
        document.getElementById('edit_shorts_size').value = student.shorts_size || '';
    }
    if (document.getElementById('edit_boots_size')) {
        document.getElementById('edit_boots_size').value = student.boots_size || '';
    }
    if (document.getElementById('edit_equipment_notes')) {
        document.getElementById('edit_equipment_notes').value = student.equipment_notes || '';
    }
}





