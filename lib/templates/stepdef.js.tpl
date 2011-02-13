Steps.{{type}}(/^{{title}}$/, function (topic) {
  return function ({{args}}) {
    // Always use or extend the same topic since you don't 
    // know how nested or not nested you are at this point
    topic = topic || {};
    
    /* Put your {{type}} code here. */
    
    return topic;
  };
});
