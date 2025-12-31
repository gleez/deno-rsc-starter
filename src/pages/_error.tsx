const onError = (err) => {
  console.error(err);

  return (
    <div className='container mx-auto p-8 text-center'>
      <h1 className='text-6xl font-bold mb-4'>Error</h1>
      <p className='text-xl mb-8'>Something went wrong</p>
      <a href='/' className='text-blue-600 hover:underline'>
        Go back home
      </a>
    </div>
  );
};

export default onError;
