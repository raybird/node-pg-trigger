fetch('/api/hello')
    .then(response => response.json())
    .then(data => {
        document.getElementById('message').innerText = data.message;
    })
    .catch(error => {
        console.error('Error fetching data:', error);
        document.getElementById('message').innerText = 'Error fetching data.';
    });