import React from 'react';
import { useParams } from 'react-router-dom';

const InvoiceDetail = () => {
  const { id } = useParams();
  return (
    <div className="page-container">
      <h2>Invoice Detail (placeholder)</h2>
      <p>Invoice ID: {id}</p>
    </div>
  );
};

export default InvoiceDetail;
